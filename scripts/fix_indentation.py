#!/usr/bin/env python3
"""
Script to fix all checkbox container indentation issues in the HTML file
"""

import re

def fix_checkbox_indentation(html_content):
    """Fix all checkbox container indentation issues"""
    
    # Pattern to match checkbox containers with incorrect indentation
    pattern = r'(<div class="checklist-item">\s*<div class="checkbox-container">(?:\s*<div class="checkbox-group">.*?</div>){2}\s*</div>)\s*(<div class="item-text">.*?</div>)\s*(</div>)'
    
    def fix_match(match):
        checkbox_part = match.group(1)
        item_text_part = match.group(2)
        closing_div = match.group(3)
        
        # Properly indent the item-text within the checklist-item
        fixed = f"{checkbox_part}\n                            {item_text_part}\n                        {closing_div}"
        return fixed
    
    # Apply the fix
    fixed_content = re.sub(pattern, fix_match, html_content, flags=re.DOTALL)
    
    return fixed_content

def main():
    html_file = "/home/touthao/projects/N10LVoice/src/client/peer_evaluation_app.html"
    
    # Read the current HTML file
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the indentation issues
    fixed_content = fix_checkbox_indentation(content)
    
    # Write back to file
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    print("Successfully fixed all checkbox container indentation issues!")

if __name__ == "__main__":
    main()
