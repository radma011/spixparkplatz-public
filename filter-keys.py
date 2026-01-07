#!/usr/bin/env python3
import sys
import re

# Read the file content
content = sys.stdin.read()

# Replace Firebase API keys with REDACTED
content = re.sub(r'apiKey:\s*"AIzaSy[^"]*"', 'apiKey: "REDACTED"', content)
content = re.sub(r'"current_key":\s*"AIzaSy[^"]*"', '"current_key": "REDACTED"', content)
content = re.sub(r'<string>AIzaSy[^<]*</string>', '<string>REDACTED</string>', content)

# Write the modified content
sys.stdout.write(content)

