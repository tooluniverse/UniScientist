#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting local installation of UniScientist CLI...${NC}"

# Ensure we are in the project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# 1. Build the CLI
echo -e "\n${YELLOW}Step 1: Building CLI binaries...${NC}"

# Add Go bin to PATH to ensure protoc plugins are found
export PATH="$PATH:$HOME/go/bin"

npm run compile-cli

if [ ! -f "dist-standalone/bin/uniscientist" ]; then
    echo -e "${YELLOW}Error: Build failed. dist-standalone/bin/uniscientist not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build successful.${NC}"

# 2. Check for existence and remove old links
TARGET_BIN="/usr/local/bin/uniscientist"
TARGET_ALIAS="/usr/local/bin/uni"
SOURCE_BIN="$PROJECT_ROOT/dist-standalone/bin/uniscientist"

echo -e "\n${YELLOW}Step 2: Linking binaries to /usr/local/bin...${NC}"
echo "You may be asked for your password to create symlinks in /usr/local/bin"

# Function to create symlink
create_symlink() {
    local src=$1
    local dest=$2
    
    if [ -L "$dest" ] || [ -f "$dest" ]; then
        echo "Removing existing $dest..."
        sudo rm "$dest"
    fi
    
    echo "Linking $src -> $dest"
    sudo ln -s "$src" "$dest"
}

create_symlink "$SOURCE_BIN" "$TARGET_BIN"
create_symlink "$SOURCE_BIN" "$TARGET_ALIAS"

echo -e "${GREEN}✓ Binaries linked.${NC}"

# 3. Verify
echo -e "\n${YELLOW}Step 3: Verifying installation...${NC}"
which uniscientist
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ uniscientist detected in PATH${NC}"
else
    echo -e "${YELLOW}Error: 'which uniscientist' failed. Please check your PATH.${NC}"
    exit 1
fi

echo -e "\n${GREEN}Installation Complete!${NC}"
echo "Now run: uniscientist auth"

# 4. Setup ToolUniverse
echo -e "\n${YELLOW}Step 4: Setting up ToolUniverse...${NC}"
./scripts/setup-tooluniverse.sh
