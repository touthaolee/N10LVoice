#!/usr/bin/env python3
"""
Comprehensive script to fix ALL checkbox container indentation issues in the HTML file
"""

import re

def fix_all_checkbox_issues(html_content):
    """Fix all checkbox container issues comprehensively"""
    
    # Fix improperly nested item-text elements
    # Pattern 1: item-text outside checklist-item
    pattern1 = r'(</div>\s*)</div>\s*(<div class="item-text">.*?</div>)\s*</div>'
    replacement1 = r'\1\2\n                        </div>'
    
    html_content = re.sub(pattern1, replacement1, html_content, flags=re.DOTALL)
    
    # Pattern 2: Fix checkbox containers with missing proper indentation
    pattern2 = r'(<div class="checkbox-container">)\s*(<div class="checkbox-group">)'
    replacement2 = r'\1\n                                \2'
    
    html_content = re.sub(pattern2, replacement2, html_content)
    
    # Pattern 3: Fix checkbox-group closing tags
    pattern3 = r'(</div>)\s*(</div>)\s*(</div>)\s*(<div class="item-text">)'
    replacement3 = r'\1\n                            \2\n                        \3\n                        \4'
    
    html_content = re.sub(pattern3, replacement3, html_content)
    
    # Pattern 4: Ensure proper spacing between sections
    pattern4 = r'(</div>\s*</div>\s*</div>\s*)(\s*)(<div class="section">)'
    replacement4 = r'\1\n\n            \3'
    
    html_content = re.sub(pattern4, replacement4, html_content)
    
    return html_content

def main():
    html_file = "/home/touthao/public/N10L/peer_evaluation_app.html"
    
    # Read the current HTML file
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("Original content length:", len(content))
    
    # Apply comprehensive fixes
    fixed_content = fix_all_checkbox_issues(content)
    
    print("Fixed content length:", len(fixed_content))
    
    # Write back to file
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    print("Successfully applied comprehensive fixes to all checkbox issues!")

if __name__ == "__main__":
    main()
