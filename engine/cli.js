#!/usr/bin/env node
const { spawn } = require('child_process')

const args = process.argv.slice(2)

if (!args.length) {
  console.log('Usage: af "Your Topic" short|long|thread')
  process.exit(1)
}

const topic = args[0]
const format = args[1] || 'short'

spawn('node', ['index.js', topic, format], {
  stdio: 'inherit'
})
