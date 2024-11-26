#!/bin/bash

DOCKER_FILE="{1}"
REMOTE_HTTP_ROOT="/root"
DOCKERFILE_PATH="{2}"

# Function to save the Dockerfile content
save_docker_file() {
    if [ -z "$DOCKER_FILE" ]; then
        echo "Error: Dockerfile content not provided."
        exit 1
    fi

    # Ensure the directory exists
    if [ ! -d "$REMOTE_HTTP_ROOT" ]; then
        echo "Creating directory: $REMOTE_HTTP_ROOT"
        mkdir -p "$REMOTE_HTTP_ROOT" || {
            echo "Error: Failed to create directory $REMOTE_HTTP_ROOT."
            exit 1
        }
    fi

    # Write the Dockerfile content to the specified path
    echo "$DOCKER_FILE" | sed 's/^[ \t]*//g' > "$REMOTE_HTTP_ROOT/$DOCKERFILE_PATH" || {
        echo "Error: Failed to write Dockerfile to $REMOTE_HTTP_ROOT/$DOCKERFILE_PATH."
        exit 1
    }

    echo "Dockerfile saved to: $REMOTE_HTTP_ROOT/$DOCKERFILE_PATH"
}

save_docker_file

