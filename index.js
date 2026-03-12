require("dotenv").config();
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 5000;

// ── middleware
app.use(cors());
app.use(express.json());

// ── verify firebase token middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized" });
  }
};

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

    const usersCollection         = client.db("medivoDb").collection("users");
    const campsCollection         = client.db("medivoDb").collection("camps");
    const registrationsCollection = client.db("medivoDb").collection("registrations");

    // ── verifyOrganizer INSIDE run() so it can access usersCollection
    const verifyOrganizer = async (req, res, next) => {
      const email = req.user?.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "organizer") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    // ════════════════════════════════
    // ROUTES
    // ════════════════════════════════

    app.get("/", (req, res) => {
      res.send("Medivo server running");
    });

    // ── USERS ──

    // get all users
    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const userWithRole = {
        ...user,
        role: "user",
        status: "active",
        createdAt: new Date().toISOString(),
      };
      const result = await usersCollection.insertOne(userWithRole);
      res.send(result);
    });

    // get user role
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      if (req.user?.email !== email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role || "user" });
    });

    // set user role
    app.patch("/users/role/:email", verifyToken, verifyOrganizer, async (req, res) => {
      const { email } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );
      res.send(result);
    });

    // ── CAMPS ──

    // get all camps (with optional organizer filter) — public
    app.get("/camps", async (req, res) => {
      const { organizerEmail } = req.query;
      const query = organizerEmail ? { organizerEmail } : {};
      const result = await campsCollection.find(query).toArray();
      res.send(result);
    });

    // get single camp — public
    app.get("/camps/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await campsCollection.findOne(query);
      res.send(result);
    });

    // create camp — organizer only
    app.post("/camps", verifyToken, verifyOrganizer, async (req, res) => {
      const camp = req.body;
      const result = await campsCollection.insertOne(camp);
      res.send(result);
    });

    // update camp — organizer only
    app.patch("/camps/:id", verifyToken, verifyOrganizer, async (req, res) => {
      const { id } = req.params;
      const updates = req.body;
      const result = await campsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
      res.send(result);
    });

    // delete camp — organizer only
    app.delete("/camps/:id", verifyToken, verifyOrganizer, async (req, res) => {
      const { id } = req.params;
      const result = await campsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // join camp — any logged in user
    app.patch("/camps/:id/join", verifyToken, async (req, res) => {
      const { id } = req.params;
      const camp = await campsCollection.findOne({ _id: new ObjectId(id) });
      if (!camp) return res.status(404).send({ message: "Camp not found" });
      if (camp.participantCount >= camp.maxParticipants) {
        return res.status(400).send({ message: "Camp is full" });
      }
      const result = await campsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { participantCount: 1 } }
      );
      res.send(result);
    });

    // ── REGISTRATIONS ──

    // create registration — any logged in user
    app.post("/registrations", verifyToken, async (req, res) => {
      const registration = req.body;
      const existing = await registrationsCollection.findOne({
        campId:           registration.campId,
        participantEmail: registration.participantEmail,
      });
      if (existing) {
        return res.status(400).send({ message: "You have already joined this camp" });
      }
      const result = await registrationsCollection.insertOne(registration);
      res.send(result);
    });

    // get registrations — logged in user only
    app.get("/registrations", verifyToken, async (req, res) => {
      const { participantEmail } = req.query;
      const query = participantEmail ? { participantEmail } : {};
      const result = await registrationsCollection.find(query).toArray();
      res.send(result);
    });

    console.log("connected to MongoDB ✓");
  } catch (err) {
    console.error(err);
  }
}

run();

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
