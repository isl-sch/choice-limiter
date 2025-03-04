import express from "express";
import cors from "cors";
import { google } from "googleapis";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert("./firebase-service-account.json"),
});
const db = admin.firestore();

// Google OAuth & Forms API
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);
const forms = google.forms({ version: "v1", auth: oauth2Client });

// Fetch form choices
app.get("/get-choices", async (req, res) => {
  try {
    const { formId } = req.query;
    const response = await forms.forms.get({ formId });
    
    const choices = response.data.items.map((item) => ({
      id: item.itemId,
      question: item.title,
      options: item.choices?.map((choice) => choice.value),
    }));
    
    res.json(choices);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch choices" });
  }
});

// Track responses & limit choices
app.post("/submit-response", async (req, res) => {
  try {
    const { formId, selectedChoice } = req.body;
    const choiceRef = db.collection("formResponses").doc(formId);
    
    const choiceDoc = await choiceRef.get();
    let choiceData = choiceDoc.exists ? choiceDoc.data() : {};
    
    choiceData[selectedChoice] = (choiceData[selectedChoice] || 0) + 1;
    
    if (choiceData[selectedChoice] >= 5) {
      choiceData[selectedChoice] = "FULL";
      await forms.forms.update({
        formId,
        updateMask: "items",
        resource: {
          items: [
            {
              title: "Booking Choices",
              choices: Object.entries(choiceData)
                .filter(([choice, count]) => count !== "FULL")
                .map(([choice]) => ({ value: choice })),
            },
          ],
        },
      });
    }

    await choiceRef.set(choiceData);
    res.json({ message: "Response recorded", updatedChoices: choiceData });
  } catch (error) {
    res.status(500).json({ error: "Error saving response" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
