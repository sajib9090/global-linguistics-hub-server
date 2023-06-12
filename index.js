const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

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
    await client.connect();

    const studentsCollection = client
      .db("globalLinguisticsHubDB")
      .collection("students");
    const classesCollection = client
      .db("globalLinguisticsHubDB")
      .collection("classes");

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
    app.get("/students", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await studentsCollection.find().toArray();
      res.send(result);
    });
    //get api

    app.get("/classes", verifyJWT, verifyAdmin, async (req, res) => {
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
