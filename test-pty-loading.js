// Test script to verify pty.node loading
const path = require('path');

console.log('Testing pty.node loading...\n');

// Test 1: Check if pty.node exists
const ptyPath = path.join(__dirname, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node');
const fs = require('fs');

console.log('1. Checking if pty.node exists:');
console.log('   Path:', ptyPath);
console.log('   Exists:', fs.existsSync(ptyPath));

// Test 2: Try to load node-pty module
console.log('\n2. Attempting to load node-pty module:');
try {
    const pty = require('node-pty');
    console.log('   ✓ Success! node-pty module loaded');
    console.log('   Available methods:', Object.keys(pty).filter(k => typeof pty[k] === 'function'));

    // Test 3: Try to spawn a simple process
    console.log('\n3. Attempting to spawn a test process:');
    try {
        const ptyProcess = pty.spawn('cmd.exe', ['/c', 'echo', 'test'], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: process.cwd(),
            env: process.env
        });

        console.log('   ✓ Success! PTY process spawned');
        console.log('   PID:', ptyProcess.pid);

        ptyProcess.onData((data) => {
            console.log('   Output:', data.trim());
        });

        setTimeout(() => {
            ptyProcess.kill();
            console.log('   ✓ Test completed successfully\n');
            process.exit(0);
        }, 1000);
    } catch (spawnError) {
        console.error('   ✗ Failed to spawn process:', spawnError.message);
        process.exit(1);
    }
} catch (loadError) {
    console.error('   ✗ Failed to load node-pty:', loadError.message);
    console.error('   Stack:', loadError.stack);
    process.exit(1);
}
