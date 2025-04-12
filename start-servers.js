const { spawn } = require('child_process');
const path = require('path');

// Get the root directory (where this script is located)
const rootDir = path.resolve(__dirname);

// Install Python dependencies
console.log('Installing Python dependencies...');
const setup = spawn('python', ['setup.py'], {
  stdio: 'inherit',
  shell: true,
  cwd: rootDir
});

setup.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to install Python dependencies');
    process.exit(1);
  }

  // Start the Python backend server
  console.log('Starting backend server...');
  const backend = spawn('python', ['backend/main.py'], {
    stdio: 'inherit',
    shell: true,
    cwd: rootDir
  });

  // Start the React frontend server
  console.log('Starting frontend server...');
  const frontend = spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(rootDir, 'frontend')
  });

  // Handle process termination
  process.on('SIGINT', () => {
    backend.kill();
    frontend.kill();
    process.exit();
  });

  process.on('SIGTERM', () => {
    backend.kill();
    frontend.kill();
    process.exit();
  });

  // Log any errors
  backend.on('error', (err) => {
    console.error('Backend server error:', err);
  });

  frontend.on('error', (err) => {
    console.error('Frontend server error:', err);
  });
}); 