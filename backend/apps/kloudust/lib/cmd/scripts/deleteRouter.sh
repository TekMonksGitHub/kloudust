#!/bin/bash

# Params
# {1}Router Name - no spaces

NAME="{1}"

function exitFailed() {
    echo Failed
    exit 1
}

if ! ip netns delete $NAME; then exitFailed; fi

printf "\n\nRouter $NAME deleted successfully"
exit 0
