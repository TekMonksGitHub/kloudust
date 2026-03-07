#!/bin/bash

function exitFailed() {
    echo Failed
    exit 1
}

printf "Rebooting the host in 1 minute\n"
sudo shutdown -r +1
exit 0