const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();


const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// Replace with your Safaricom credentials
const consumerKey = "YOUR_CONSUMER_KEY";
const consumerSecret = "YOUR_CONSUMER_SECRET";
const shortcode = "174379"; // Daraja sandbox default
const passkey = "YOUR_PASSKEY";

// Your ngrok callback URL (update every time ngrok restarts)
const callbackURL = "https://granolithic-pseudomasculine-mal.ngrok-free.app/callback";

// Get access token
const getAccessToken = async () => {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
};

// STK push endpoint
app.post("/stk_push", async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ error: "Missing phoneNumber or amount" });
    }

    // ✅ Format phone to Safaricom standard: 2547XXXXXXXX
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith("+")) {
      formattedPhone = formattedPhone.slice(1); // remove "+"
    }

    const token = await getAccessToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackURL,
        AccountReference: "Test123",
        TransactionDesc: "Payment"
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json(response.data);
  } catch (err) {
    console.error("STK Push Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "STK Push failed",
      details: err.response?.data || err.message,
    });
  }
});

// Callback route
app.post("/callback", (req, res) => {
  console.log("📩 Callback received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));