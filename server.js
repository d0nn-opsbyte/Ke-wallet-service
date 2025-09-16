require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

// Daraja credentials
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;
const shortcode = process.env.SHORTCODE || "174379"; // sandbox
const passkey = process.env.PASSKEY;

// --------------------
// 1️⃣ Get access token
// --------------------
app.get("/access_token", async (req, res) => {
  try {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate access token" });
  }
});

// --------------------
// 2️⃣ STK Push
// --------------------
app.post("/stk_push", async (req, res) => {
  const { phoneNumber, amount, userId } = req.body;

  if (!phoneNumber || !amount || !userId) {
    return res.status(400).json({ error: "phoneNumber, amount, and userId are required" });
  }

  try {
    // 1️⃣ Get access token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenResp = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const accessToken = tokenResp.data.access_token;

    // 2️⃣ Generate timestamp and password
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    // 3️⃣ Construct STK payload
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: "https://gold-spoons-sleep.loca.lt/api/mpesa/callback", // <- Replace with your LocalTunnel URL
      AccountReference: `USER-${userId}`,
      TransactionDesc: "Wallet Top-up",
    };

    console.log(`📤 STK Push Payload:`, payload);

    // 4️⃣ Send STK request
    const stkURL = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
    const stkResponse = await axios.post(stkURL, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`📥 STK Push Response:`, stkResponse.data);

    if (stkResponse.data.ResponseCode !== "0") {
      return res.status(400).json({
        error: "STK Push rejected by Safaricom",
        details: stkResponse.data,
      });
    }

    res.json({
      message: "STK Push initiated successfully",
      rawResponse: stkResponse.data,
    });
  } catch (error) {
    console.error("❌ STK Push Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "STK Push failed",
      details: error.response?.data || error.message,
    });
  }
});

// --------------------
// 3️⃣ M-Pesa Callback
// --------------------
app.post("/api/mpesa/callback", (req, res) => {
  console.log("📩 M-Pesa Callback Received:", JSON.stringify(req.body, null, 2));

  const callback = req.body.Body?.stkCallback;
  if (!callback) return res.status(400).json({ error: "Invalid callback data" });

  if (callback.ResultCode === 0) {
    const amount = callback.CallbackMetadata.Item.find(i => i.Name === "Amount").Value;
    const phone = callback.CallbackMetadata.Item.find(i => i.Name === "PhoneNumber").Value;
    const netAmount = amount * 0.9; // Deduct 10% commission

    console.log(`💰 Payment Success: ${amount} from ${phone}, Net: ${netAmount}`);

    // TODO: Update wallet in db.json here

    return res.json({ message: "Wallet updated", netAmount });
  } else {
    console.log("❌ Payment Failed:", callback.ResultDesc);
    return res.json({ message: "Payment failed", details: callback.ResultDesc });
  }
});

// --------------------
// Start server
// --------------------
app.listen(port, () => {
  console.log(`🚀 Wallet/STK server running at http://localhost:${port}`);
});