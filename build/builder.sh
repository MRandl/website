#!/bin/bash

SKELETON="skeleton.html"
OUTPUT="../public/index.html"

# Reset dist file
cp "$SKELETON" "$OUTPUT"

echo "Building site..."

# Logic: Find every instance of {{filename}},
# Read the file, and replace the brackets with the content.
for part in $(grep -oE '\{\{[a-zA-Z0-9._-]+\}\}' "$SKELETON"); do
    # Remove the {{ and }} to get the actual filename
    filename=$(echo "$part" | sed 's/[{}]//g')

    if [ -f "$filename" ]; then
        echo "  > Injecting $filename"
        # Use sed to 'r' (read) the file into the output at the match point
        # Then 'd' (delete) the placeholder line itself
        sed -i "/{{$filename}}/{r $filename
d}" "$OUTPUT"
    else
        echo "File $filename not found!"
    fi
done

minhtml $OUTPUT -o $OUTPUT

echo "Success: '$OUTPUT' is ready."
