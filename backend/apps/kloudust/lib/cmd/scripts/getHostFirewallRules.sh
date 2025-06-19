#!/bin/bash

#########################################################################################################
# Returns current NFT ruleset for the host.
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################


function exitFailed() {
    echo Failed.
    exit 1
}

if ! nft list ruleset; then exitFailed; fi                  # save it so it surives boot