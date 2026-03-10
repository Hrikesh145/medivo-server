require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// ── middleware
app.use(cors());
app.use(express.json());

// ── mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nkuntqh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db("medivoDb").collection("users");
    const campsCollection = client.db("medivoDb").collection("camps");

    // ── routes

    app.get("/", (req, res) => {
      res.send("Medivo server running");
    });

    // users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }

      const userWithRole = {
        ...user,
        role: "user",
        status: "active", // active / blocked
        createdAt: new Date().toISOString(),
      };

      console.log("new user ", userWithRole);
      const result = await usersCollection.insertOne(userWithRole);
      res.send(result);
    });

    // ── CAMPS ROUTES ──

    // get all camps
    app.get("/camps", async (req, res) => {
      const result = await campsCollection.find().toArray();
      res.send(result);
    });

    // get single camp
    app.get("/camps/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await campsCollection.findOne(query);
      res.send(result);
    });

    // create camp
    app.post("/camps", async (req, res) => {
      const camp = req.body;
      console.log("new camp →", camp);
      const result = await campsCollection.insertOne(camp);
      res.send(result);
    });

    console.log("connected to MongoDB");
  } catch (err) {
    console.error(err);
  }
}

run();

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
