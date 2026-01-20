#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}Setting up ToolUniverse...${NC}"

# Check for uv
if command -v uv &> /dev/null; then
    echo -e "${GREEN}✓ uv detected${NC}"
    echo "Installing tooluniverse via uv tool..."
    uv tool install tooluniverse --force
    
    # Ensure the tool is in the path
    # uv tool install maps the binary automatically, usually to ~/.local/bin or similar
    echo -e "${GREEN}✓ tooluniverse installed via uv${NC}"
else
    echo -e "${YELLOW}uv not found. Falling back to pip...${NC}"
    echo "Installing tooluniverse via pip..."
    pip install tooluniverse
    echo -e "${GREEN}✓ tooluniverse installed via pip${NC}"
fi

# Verify installation
if command -v tooluniverse-smcp-stdio &> /dev/null; then
    echo -e "${GREEN}✓ tooluniverse-smcp-stdio is available in PATH${NC}"
else
    echo -e "${YELLOW}Warning: tooluniverse-smcp-stdio not found in PATH after installation.${NC}"
    echo "You may need to add your python bin directory to your PATH."
    # Attempt to show where it might be
    if command -v uv &> /dev/null; then
       echo "Check 'uv tool list' for details."
    fi
fi
