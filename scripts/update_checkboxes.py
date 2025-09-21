#!/usr/bin/env python3
"""
Script to update all checkbox containers in the HTML file to use the new visual format
"""

import re

def update_checkbox_format(html_content):
    """Update checkbox containers to use the new visual format"""
    
    # Pattern to match the old checkbox container format
    old_pattern = r'<div class="checkbox-container">\s*<input type="checkbox" class="checkbox(?:\s+\w+)?" name="([^"]+)" id="([^"]+)">\s*<input type="checkbox" class="checkbox (?:failed|fail)" name="([^"]+)" id="([^"]+)">\s*</div>'
    
    def replace_checkbox(match):
        pass_name = match.group(1)
        pass_id = match.group(2)
        fail_name = match.group(3)
        fail_id = match.group(4)
        
        new_format = f'''<div class="checkbox-container">
                            <div class="checkbox-group">
                                <input type="checkbox" class="checkbox pass" name="{pass_name}" id="{pass_id}">
                                <label for="{pass_id}" class="checkbox-label pass">✓ PASS</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" class="checkbox fail" name="{fail_name}" id="{fail_id}">
                                <label for="{fail_id}" class="checkbox-label fail">✗ FAIL</label>
                            </div>
                        </div>'''
        return new_format
    
    # Apply the replacement
    updated_content = re.sub(old_pattern, replace_checkbox, html_content, flags=re.MULTILINE | re.DOTALL)
    
    return updated_content

def main():
    html_file = "/home/touthao/projects/N10LVoice/src/client/peer_evaluation_app.html"
    
    # Read the current HTML file
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update the checkbox format
    updated_content = update_checkbox_format(content)
    
    # Write back to file
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(updated_content)
    
    print("Successfully updated all checkbox containers!")

if __name__ == "__main__":
    main()
