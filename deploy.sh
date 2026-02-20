#!/bin/bash

# Basic CI/CD Pipeline for Asset Factory

set -e # Exit immediately if a command exits with a non-zero status.

echo "CI/CD: Installing dependencies..."
pnpm install

echo "CI/CD: Linting codebase..."
pnpm lint

echo "CI/CD: Running tests..."
pnpm test

echo "CI/CD: Building application..."
cd assetfactory-studio
pnpm build
cd ..

echo "CI/CD: Deploying to Firebase..."
firebase deploy --only hosting,functions

echo "CI/CD: Deployment complete!"
