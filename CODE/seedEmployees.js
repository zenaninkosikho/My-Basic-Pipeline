const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Employee = require('./models/Employee'); // Adjust this path if necessary

// MongoDB connection URI (adjust if necessary)
const dbURI = 'mongodb://localhost:27017/mern_registration'; // Update with your MongoDB URI

// Employee data
const employees = [
  {
    fullName: 'John Doe',
    accountNumber: '12345',
    password: 'Employee1Pass#',
  },
  {
    fullName: 'Jane Smith',
    accountNumber: '67890',
    password: 'Employee2Pass#',
  },
];

// Function to hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Connect to MongoDB and seed employee data
mongoose.connect(dbURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log('Connected to MongoDB');

  // Seed employees
  for (const employeeData of employees) {
    const hashedPassword = await hashPassword(employeeData.password);

    const employee = new Employee({
      fullName: employeeData.fullName,
      accountNumber: employeeData.accountNumber,
      passwordHash: hashedPassword,
    });

    await employee.save();
    console.log(`Employee ${employeeData.fullName} created successfully`);
  }

  // Close the connection
  mongoose.connection.close();
}).catch((err) => {
  console.error('Error connecting to MongoDB:', err);
});
