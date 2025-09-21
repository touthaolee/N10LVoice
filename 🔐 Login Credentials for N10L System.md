🔐 Login Credentials for N10L System
👨‍🏫 Admin Dashboard Login
URL: https://educationservice.net/N10L/admin (or http://localhost:3001/admin)

Credentials:

Username: admin
Password: admin123
Role: Admin/Instructor
🎓 Student Personal Care Login
URL: https://educationservice.net/N10L/personal-care (or http://localhost:3001/personal-care)

Authentication:

Student Name: Any name (e.g., "John Smith", "Jane Doe")
Password: student123 (automatic - handled by system)
Role: Student
🔍 How It Works:
Admin Login:

Go to admin page
Enter username: admin
Enter password: admin123
System verifies against database and grants admin access
Student Login:

Go to /personal-care page
Enter your full name in the modal
System automatically:
Tries to register you with password student123
If username exists, logs you in with student123
Creates a JWT token for your session
📊 Database Users:
Default Admin: Created automatically on first run

Username: admin
Password: admin123 (bcrypt hashed)
Role: admin
Students: Created dynamically when they first log in

Username: Whatever name they enter
Password: student123 (bcrypt hashed)
Role: student
🎯 Access Points:
Local Development: http://localhost:3001/admin | http://localhost:3001/personal-care
Production: https://educationservice.net/N10L/admin | https://educationservice.net/N10L/personal-care
The system automatically handles student registration - just enter any name and it will create an account or log you into an existing one!