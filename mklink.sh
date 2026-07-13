#!/bin/bash
APP_DIR="$( cd "$( dirname "$0" )" && pwd )"
pushd . > /dev/null
cd "$APP_DIR/../"
WORK_DIR=$PWD
popd > /dev/null
if [ "$1" == "" ]; then
	echo Usage: $0 [name of the application]
	exit 1
fi
APP_NAME=$1

ln -s "$WORK_DIR/$APP_NAME" "$APP_DIR/backend/apps/kloudust/3p"   

echo Done.
