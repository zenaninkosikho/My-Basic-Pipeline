// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // For generating tokens on login
const Customer = require('./models/Customer'); // Import the Customer model
const Payment = require('./models/Payment'); // Import the Payment model
const Employee = require('./models/Employee'); // Import Employee model
const Transaction = require('./models/Transaction');
const SWIFT = require('./models/SWIFT');

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(bodyParser.json()); // Parse JSON bodies

// SSL Configuration (Replace with actual certificate paths)
const sslOptions = {
    key: fs.readFileSync('./ssl/privatekey.pem'),
    cert: fs.readFileSync('./ssl/certificate.pem') // Path to your certificate file
};

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/mern_registration', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((error) => console.error('MongoDB connection error:', error));

// Helper function to hash passwords
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Helper function to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied, token is missing!' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Registration Route
app.post('/register', async (req, res) => {
  try {
    const { fullName, idNumber, accountNumber, password } = req.body;

    // Input validation using regex patterns
    if (!/^[a-zA-Z\s]+$/.test(fullName) || 
        !/^\d{13}$/.test(idNumber) || 
        !/^\d+$/.test(accountNumber) ||
        !/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{8,}$/.test(password)) {
      return res.status(400).json({ error: 'Invalid input format' });
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Save the new customer to the database
    const customer = new Customer({ fullName, idNumber, accountNumber, passwordHash });
    await customer.save();

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login Route
app.post('/login', async (req, res) => {
  try {
    const { accountNumber, password } = req.body;

    // Whitelist validation
    if (!/^\d+$/.test(accountNumber) || !/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{8,}$/.test(password)) {
      return res.status(400).json({ error: 'Invalid input format' });
    }

    // Find customer by account number
    const customer = await Customer.findOne({ accountNumber });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, customer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: customer._id, accountNumber: customer.accountNumber }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Payment Route (Customers)
app.post('/payment', verifyToken, async (req, res) => {
  try {
    const { amount, currency, provider, recipientAccount, swiftCode } = req.body;

    // Input validation using regex patterns
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      return res.status(400).json({ error: 'Invalid amount format' });
    }
    if (!/^[A-Za-z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Invalid currency format' });
    }
    if (!/^[A-Za-z0-9]+$/.test(provider)) {
      return res.status(400).json({ error: 'Invalid provider format' });
    }
    if (!/^[A-Za-z0-9]+$/.test(swiftCode)) {
      return res.status(400).json({ error: 'Invalid SWIFT code format' });
    }

    // Check if customer exists
    const customer = await Customer.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Save payment to the database
    const payment = new Payment({
      amount,
      currency,
      provider,
      recipientAccount,
      swiftCode,
      customerId: customer._id, // Save the customer reference
    });

    await payment.save();

    res.status(200).json({
      message: 'Payment successfully processed',
      paymentDetails: payment,
    });
  } catch (error) {
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Employee Login Route
app.post('/employeelogin', async (req, res) => {
    try {
      const { accountNumber, password } = req.body;
  
      // Whitelist validation using regex patterns
      if (!/^\d+$/.test(accountNumber) || !/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{8,}$/.test(password)) {
        return res.status(400).json({ error: 'Invalid input format' });
      }
  
      // Pre-registered employees
      const employees = [
        { accountNumber: '12345', passwordHash: await hashPassword('Employee1Pass#') },
        { accountNumber: '67890', passwordHash: await hashPassword('Employee2Pass#') }
      ];
  
      // Find the employee by account number
      const employee = employees.find(emp => emp.accountNumber === accountNumber);
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }
  
      // Compare the password with the stored hashed password
      const isMatch = await bcrypt.compare(password, employee.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password' });
      }
  
      // Generate JWT token
      const token = jwt.sign({ id: employee._id, accountNumber: employee.accountNumber }, process.env.JWT_SECRET, {
        expiresIn: '1h',
      });

      res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
      res.status(500).json({ error: 'Login failed2' });
    }
  });

  // Route to get all transactions for the employee to review
// Route to get all payments for the employee to review
app.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.find();
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

  
  // Route to verify and submit a transaction to SWIFT
  // Route to verify and submit a payment to transactions
  // Route to verify a payment and move it to the transactions collection
// server.js
// Verify and transfer payment to transactions
// Route to verify payment and move it to the transactions collection
app.post('/paymentverify', async (req, res) => {
    try {
      const { paymentId } = req.body;
  
      // Find the payment document in the payments collection
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }
  
      // Extract necessary fields from the payment document
      const transactionData = {
        customerId: payment.customerId,            // Include the customerId
        customerAccount: payment.customerAccount,  // Add customerAccount if needed
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        recipientAccount: payment.recipientAccount,
        swiftCode: payment.swiftCode,
        status: 'verified',
      };
  
      // Create a new transaction document in the transactions collection
      const transaction = new Transaction(transactionData);
      await transaction.save();
  
      // Optionally, remove the payment from payments collection
      await Payment.findByIdAndDelete(paymentId);
  
      res.json({ message: 'Payment verified and moved to transactions' });
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ message: 'Failed to verify payment' });
    }
  });
  
  
  
  
  

  // Route to submit all verified transactions to the SWIFT collection
app.post('/submitAllToSWIFT', async (req, res) => {
    try {
      // Find all verified transactions
      const verifiedTransactions = await Transaction.find({ status: 'verified' });
  
      // Move each verified transaction to the SWIFT collection
      for (let transaction of verifiedTransactions) {
        const swiftTransaction = new SWIFT({
          
          customerId: transaction.customerId,
          customerAccount: transaction.customerAccount,
          amount: transaction.amount,
          currency: transaction.currency,
          provider: transaction.provider,
          recipientAccount: transaction.recipientAccount,
          swiftCode: transaction.swiftCode,
          status: 'submitted',
          createdAt: transaction.createdAt,
        });
  
        await swiftTransaction.save();
        await Transaction.findByIdAndDelete(transaction._id);
      }
  
      res.status(200).json({ message: 'All verified transactions submitted to SWIFT' });
    } catch (error) {
      console.error('Error submitting transactions to SWIFT:', error);
      res.status(500).json({ error: 'Failed to submit transactions to SWIFT' });
    }
  });
  
  
  
  
  

// Start HTTPS Server
const PORT = process.env.PORT || 3000;
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Secure server is running on https://localhost:${PORT}`);
});

module.exports = app;
