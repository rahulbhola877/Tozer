#!/bin/sh
cd /home/claude/tozer && python3 tools/unpack.py | tail -2 && grep -oE '(P23 )*NEXT:[0-9]* OF:[0-9]*' $(ls -t /root/.claude/projects/-home-claude/318c2c65-1ae2-5a6e-9c5a-71ab55813ec5/tool-results/mcp-remote-devices-Claude_Browser__javascript_tool-*.txt | head -1)
