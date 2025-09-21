#!/usr/bin/env python3
"""
Simple script to attempt text extraction from doc file
"""

import re
import sys
from pathlib import Path

def extract_text_from_doc_simple(file_path):
    """
    Attempt to extract readable text from a .doc file using simple methods
    """
    try:
        # Try reading as binary and extract readable text
        with open(file_path, 'rb') as file:
            content = file.read()
            
        # Convert to string, ignoring errors
        text_content = content.decode('utf-8', errors='ignore')
        
        # Clean up the text - remove control characters and excessive whitespace
        # Keep alphanumeric, common punctuation, and whitespace
        cleaned_text = re.sub(r'[^\x20-\x7E\n\r\t]', ' ', text_content)
        
        # Remove excessive whitespace
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
        
        # Split into lines and filter out very short or meaningless lines
        lines = []
        for line in cleaned_text.split('\n'):
            line = line.strip()
            # Keep lines that have some meaningful content
            if len(line) > 10 and any(c.isalpha() for c in line):
                lines.append(line)
        
        return '\n'.join(lines)
        
    except Exception as e:
        return f"Error reading file: {str(e)}"

def extract_text_alternative_method(file_path):
    """
    Alternative method using different encoding attempts
    """
    encodings = ['utf-8', 'latin1', 'cp1252', 'iso-8859-1']
    
    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding, errors='ignore') as file:
                content = file.read()
                
            # Look for patterns that might be readable text
            sentences = re.findall(r'[A-Z][^.!?]*[.!?]', content)
            if sentences:
                return f"Method with {encoding} encoding found:\n" + '\n'.join(sentences[:20])  # First 20 sentences
                
        except Exception:
            continue
    
    return "Could not extract readable text with alternative methods"

def main():
    file_path = "Week 1 Personal Care Scenario -   Fall 2025.doc"
    
    if not Path(file_path).exists():
        print(f"Error: File '{file_path}' not found")
        return
    
    print(f"Attempting to extract text from: {file_path}")
    print("=" * 60)
    
    # Try simple method
    print("Method 1: Simple binary extraction")
    print("-" * 40)
    result1 = extract_text_from_doc_simple(file_path)
    print(result1[:1000] + "..." if len(result1) > 1000 else result1)
    
    print("\n" + "=" * 60)
    
    # Try alternative method
    print("Method 2: Alternative encoding extraction")
    print("-" * 40)
    result2 = extract_text_alternative_method(file_path)
    print(result2)
    
    # Save both results to files
    try:
        with open("extraction_method1.txt", 'w', encoding='utf-8') as f:
            f.write(result1)
        print(f"\nMethod 1 results saved to: extraction_method1.txt")
        
        with open("extraction_method2.txt", 'w', encoding='utf-8') as f:
            f.write(result2)
        print(f"Method 2 results saved to: extraction_method2.txt")
            
    except Exception as e:
        print(f"Error saving results: {e}")

if __name__ == "__main__":
    main()
