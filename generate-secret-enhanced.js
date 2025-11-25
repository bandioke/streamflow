const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecureSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

function createEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  console.log('🔐 StreamFlow Security Setup\n');
  
  // Generate secrets
  const sessionSecret = generateSecureSecret(64);
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists!');
    console.log('📝 Reading existing configuration...\n');
    
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check if SESSION_SECRET exists
    if (envContent.includes('SESSION_SECRET=')) {
      console.log('✅ SESSION_SECRET already configured');
      console.log('   If you want to regenerate, delete .env file and run this script again.\n');
    } else {
      console.log('⚠️  SESSION_SECRET not found in .env');
      console.log('➕ Adding SESSION_SECRET...\n');
      
      // Add SESSION_SECRET
      if (!envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `\n# Session Security\nSESSION_SECRET=${sessionSecret}\n`;
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ SESSION_SECRET added to .env file');
    }
  } else {
    console.log('📝 Creating new .env file...\n');
    
    // Read .env.example if exists
    let envContent = '';
    if (fs.existsSync(envExamplePath)) {
      envContent = fs.readFileSync(envExamplePath, 'utf8');
      
      // Replace placeholder with actual secret
      envContent = envContent.replace(
        'SESSION_SECRET=your_random_secret_here_minimum_32_characters_long',
        `SESSION_SECRET=${sessionSecret}`
      );
    } else {
      // Create minimal .env
      envContent = `# Server Configuration
PORT=7575
NODE_ENV=development

# Session Security
SESSION_SECRET=${sessionSecret}

# Database Configuration
DATABASE_PATH=./db/streamflow.db
`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully!\n');
  }
  
  // Display security information
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 SECURITY INFORMATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('✅ Session Secret: Generated (128 characters)');
  console.log('   Location: .env file');
  console.log('   ⚠️  NEVER commit this file to Git!\n');
  
  // Check .gitignore
  const gitignorePath = path.join(__dirname, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignoreContent.includes('.env')) {
      console.log('⚠️  WARNING: .env is not in .gitignore!');
      console.log('   Adding .env to .gitignore...\n');
      fs.appendFileSync(gitignorePath, '\n# Environment variables\n.env\n.env.local\n');
      console.log('✅ .env added to .gitignore\n');
    } else {
      console.log('✅ .env is properly ignored by Git\n');
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('1. Review .env file and configure other settings');
  console.log('2. For production, set NODE_ENV=production');
  console.log('3. For HTTPS, set ENABLE_HTTPS=true and provide SSL certificates');
  console.log('4. Start the application: npm start\n');
  
  console.log('🔐 Security Best Practices:');
  console.log('   • Never share your SESSION_SECRET');
  console.log('   • Use different secrets for dev/staging/production');
  console.log('   • Rotate secrets periodically');
  console.log('   • Enable HTTPS in production');
  console.log('   • Use strong passwords for all accounts\n');
}

// Run the script
try {
  createEnvFile();
  console.log('✅ Setup completed successfully!\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Error during setup:', error.message);
  process.exit(1);
}
