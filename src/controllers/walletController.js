// ✅ Pay for a service with 10% commission
export const payForService = async (req, res) => {
  const { buyerId, sellerId, amount, description } = req.body;

  try {
    // Fetch buyer wallet
    const buyerWallet = await pool.query("SELECT * FROM wallets WHERE user_id=$1", [buyerId]);
    if (!buyerWallet.rows.length) return res.status(404).json({ error: "Buyer wallet not found" });

    // Check balance
    if (buyerWallet.rows[0].balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Fetch seller wallet
    const sellerWallet = await pool.query("SELECT * FROM wallets WHERE user_id=$1", [sellerId]);
    if (!sellerWallet.rows.length) return res.status(404).json({ error: "Seller wallet not found" });

    // Fetch platform wallet (assume user_id=1 is Platform)
    const platformWallet = await pool.query("SELECT * FROM wallets WHERE user_id=$1", [1]);
    if (!platformWallet.rows.length) return res.status(404).json({ error: "Platform wallet not found" });

    // Calculate commission
    const commission = amount * 0.10;
    const sellerAmount = amount - commission;

    // Deduct from buyer
    await pool.query("UPDATE wallets SET balance = balance - $1 WHERE user_id=$2", [amount, buyerId]);
    await pool.query(
      "INSERT INTO transactions (wallet_id, amount, type, description) VALUES ($1, $2, 'debit', $3)",
      [buyerWallet.rows[0].id, amount, description || "Service payment"]
    );

    // Credit seller (90%)
    await pool.query("UPDATE wallets SET balance = balance + $1 WHERE user_id=$2", [sellerAmount, sellerId]);
    await pool.query(
      "INSERT INTO transactions (wallet_id, amount, type, description) VALUES ($1, $2, 'credit', $3)",
      [sellerWallet.rows[0].id, sellerAmount, "Service earnings"]
    );

    // Credit platform (10%)
    await pool.query("UPDATE wallets SET balance = balance + $1 WHERE user_id=$2", [commission, 1]);
    await pool.query(
      "INSERT INTO transactions (wallet_id, amount, type, description) VALUES ($1, $2, 'credit', $3)",
      [platformWallet.rows[0].id, commission, "Commission earned"]
    );

    res.json({
      message: "Payment successful",
      buyerId,
      sellerId,
      amount,
      sellerAmount,
      commission
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};