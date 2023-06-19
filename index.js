const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

app.use(cors());
app.use(express.json());

// mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// validate jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization);
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }
  const token = authorization.split(" ")[1];
  // console.log(token);
  // token verify
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const studentsCollection = client
      .db("globalLinguisticsHubDB")
      .collection("students");
    const classesCollection = client
      .db("globalLinguisticsHubDB")
      .collection("classes");
    const cartCollection = client
      .db("globalLinguisticsHubDB")
      .collection("carts");
    const paymentsCollection = client
      .db("globalLinguisticsHubDB")
      .collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await studentsCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await studentsCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    //generate client secret
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = parseFloat(price) * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });
    //generate jwt token

    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      // console.log(token);
      res.send({ token });
    });

    //get api
    app.get("/students", async (req, res) => {
      const result = await studentsCollection.find().toArray();
      res.send(result);
    });
    //get api

    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });
    //
    app.get("/classes/approved", async (req, res) => {
      const approvedClasses = await classesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(approvedClasses);
    });
    app.get("/classes/approved/sorted", async (req, res) => {
      const approvedClasses = await classesCollection
        .find({ status: "approved" })
        .sort({ availableSeats: -1 })
        .toArray();

      res.send(approvedClasses);
    });
    ///
    app.get("/classes/pending", async (req, res) => {
      const pendingClasses = await classesCollection
        .find({ status: "pending" })
        .toArray();
      res.send(pendingClasses);
    });

    // get api by email
    app.get(
      "/classes/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const decodedEmail = req.decoded.email;
        // console.log(decodedEmail);
        const instructorEmail = req.params.email;
        // console.log(instructorEmail);
        if (instructorEmail !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden Access" });
        }
        const query = { instructorEmail: instructorEmail };
        const result = await classesCollection.find(query).toArray();
        res.send(result);
      }
    );
    //

    //
    app.post("/classes", async (req, res) => {
      const course = req.body;
      const result = await classesCollection.insertOne(course);
      res.send(result);
    });

    // get api
    //

    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    //add to cart
    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });
    //

    app.post("/students", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await studentsCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await studentsCollection.insertOne(user);
      res.send(result);
    });

    //
    app.get("/students/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const student = await studentsCollection.findOne(query);
      const result = { admin: student?.role === "admin" };
      res.send(result);
    });

    app.patch("/students/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await studentsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/students/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const student = await studentsCollection.findOne(query);
      const result = { instructor: student?.role === "instructor" };
      res.send(result);
    });

    app.patch("/students/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await studentsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/approved/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    ///
    app.patch("/classes/denied/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "denied",
          reason: req.body.reason,
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete api

    app.delete("/students/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studentsCollection.deleteOne(query);
      res.send(result);
    });
    app.delete("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.deleteOne(query);
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment);
      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const updateDoc = {
        $set: {
          info: "payment done",
        },
      };
      const updateResult = await cartCollection.updateMany(query, updateDoc);

      res.send({ insertResult, updateResult });
    });
    //
    //------------------------------------------------------
    app.patch("/classes/:id", async (req, res) => {
      try {
        const classId = req.params.id;
        const { availableSeats, enrollment } = req.body;

        // Validate and sanitize the input as needed

        // Update the class using the provided ID and update fields
        const updateResult = await classesCollection.updateOne(
          { _id: ObjectId(classId) },
          { $set: { availableSeats, enrollment } }
        );

        if (updateResult.modifiedCount > 0) {
          res.json({ success: true, message: "Class information updated." });
        } else {
          res.json({
            success: false,
            message: "Class not found or no changes were made.",
          });
        }
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    //----------------------------------------------------------------------------------
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Global linguistics hub is running");
});

app.listen(port, () => {
  console.log(`Global linguistics hub server is running on port, ${port}`);
});
