require("dotenv").config();

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");

const User = require("./models/user.model");
const Note = require("./models/note.model");
const { authenticateToken } = require("./utilities");

const app = express();

// Middleware
app.use(express.json()); // Parse JSON request bodies
app.use(cors({ origin: "*" })); // Enable CORS from any origin

// Connect to MongoDB (without deprecated options)
mongoose
  .connect(process.env.MONGO_URI)
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
app.get("/", (req, res) => {
  res.json({ data: "Hello World" });
});

// Create Account
app.post("/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;

  // Validation checks
  if (!fullName) {
    return res
      .status(400)
      .json({ error: true, message: "Full Name is required" });
  }

  if (!email) {
    return res.status(400).json({ error: true, message: "Email is required" });
  }

  if (!password) {
    return res
      .status(400)
      .json({ error: true, message: "Password is required" });
  }

  // Check if the user already exists
  const isUser = await User.findOne({ email });
  if (isUser) {
    return res.json({ error: true, message: "User Already Exists" });
  }

  // Create new user (password stored in plain text)
  const user = new User({
    fullName,
    email,
    password, // Store the password directly (without hashing)
  });

  await user.save();

  // Create JWT token
  const accessToken = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "10h" }
  );

  return res.json({
    error: false,
    user: { fullName: user.fullName, email: user.email },
    accessToken,
    message: "Registration Successful",
  });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  const userInfo = await User.findOne({ email });

  if (!userInfo) {
    return res.status(400).json({ message: "User not found" });
  }

  // Compare provided password with the stored plain text password
  if (password === userInfo.password) {
    const accessToken = jwt.sign(
      { userId: userInfo._id, email: userInfo.email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "10h" }
    );
    return res.json({
      error: false,
      message: "Login Successful",
      email,
      accessToken,
    });
  } else {
    return res
      .status(400)
      .json({ error: true, message: "Invalid email or password" });
  }
});

// Get User
app.get("/get-user", authenticateToken, async (req, res) => {
  const userId = req.user.userId; // Get userId directly from req.user

  try {
    const isUser = await User.findById(userId); // Use findById for simplicity

    if (!isUser) {
      return res.sendStatus(401); // Unauthorized
    }

    return res.json({
      user: {
        fullName: isUser.fullName,
        email: isUser.email,
        _id: isUser._id,
        createdOn: isUser.createdOn,
      },
      message: "",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res
      .status(500)
      .json({ error: true, message: "Internal Server Error" });
  }
});

// Add Note
app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags } = req.body;
  const { userId } = req.user; // Get userId from req.user

  if (!title) {
    return res.status(400).json({ error: true, message: "Title is required" });
  }

  if (!content) {
    return res
      .status(400)
      .json({ error: true, message: "Content is required" });
  }

  try {
    const note = new Note({
      title,
      content,
      tags: tags || [],
      userId,
    });
    await note.save();
    return res.json({ error: false, note, message: "Note added successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ error: true, message: "Internal Server Error" });
  }
});

// Edit Note
app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, tags, isPinned } = req.body;
  const { userId } = req.user; // Get userId from req.user

  if (!title && !content && !tags) {
    return res
      .status(400)
      .json({ error: true, message: "No changes provided" });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (isPinned !== undefined) note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: true, message: "Internal server error" });
  }
});

// Get All Notes
app.get("/get-all-notes/", authenticateToken, async (req, res) => {
  const { userId } = req.user; // Get userId from req.user

  try {
    const notes = await Note.find({ userId }).sort({ isPinned: -1 });

    return res.json({
      error: false,
      notes,
      message: "All notes retrieved successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: true, message: "Internal Server Error" });
  }
});

// Delete Note
app.delete("/delete-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { userId } = req.user; // Get userId from req.user

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    await Note.deleteOne({ _id: noteId, userId });

    return res.json({ error: false, message: "Note deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ error: true, message: "Internal Server Error" });
  }
});

// Update isPinned Value
app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const { userId } = req.user; // Get userId from req.user

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: true, message: "Internal server error" });
  }
});

//Search Note
app.get("/search-notes", authenticateToken, async (req, res) => {
  const { userId } = req.user; // Assuming req.user contains the userId
  const { query } = req.query;

  if (!query || query.trim() === "") {
    return res
      .status(400)
      .json({ error: true, message: "Search query is required" });
  }

  try {
    const regex = new RegExp(query.trim(), "i"); // Create a regex for case-insensitive search

    const matchingNotes = await Note.find({
      userId: userId,
      $or: [{ title: { $regex: regex } }, { content: { $regex: regex } }],
    });

    return res.json({
      error: false,
      notes: matchingNotes,
      message: "Notes matching the search query retrieved successfully",
    });
  } catch (error) {
    console.error("Search notes error:", error);
    return res
      .status(500)
      .json({ error: true, message: "Internal Server Error" });
  }
});

// Listen on port 8000
const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Export the app for testing or other purposes
module.exports = app;
