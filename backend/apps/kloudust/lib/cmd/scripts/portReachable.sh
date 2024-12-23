VM_NAME="{1}"
PYTHON_SERVER_PORT="{2}"
REACHABLE_PORT="{3}" 

cd /kloudust || exit 1

PID_FILE="server.pid"

UFW_CHECK=$(ufw status | awk -v port="$PYTHON_SERVER_PORT" '$1 ~ port && $2 == "ALLOW" && $NF == "Anywhere"')
if [ -z "$UFW_CHECK" ]; then
    echo "Port $PYTHON_SERVER_PORT is not allowed. Allowing it through ufw..."
    sudo ufw allow "$PYTHON_SERVER_PORT"
else
    echo "PORT $PYTHON_SERVER_PORT is already allowed in ufw."
fi

# Function to start the server
start_server() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Server is already running with PID: $(cat $PID_FILE)"
    else
        echo "Starting the server..."
        python3 -m http.server -b 192.168.122.1 "$PYTHON_SERVER_PORT" &  # Start in the background
        echo $! > "$PID_FILE"                           # Save PID to a file
        echo "Server started with PID: $(cat $PID_FILE)"
    fi
}

# Function to stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        echo "Stopping the server with PID: $PID..."
        if kill "$PID" 2>/dev/null; then
            rm -f "$PID_FILE"
            echo "Server stopped."
        else
            echo "Failed to stop the server. Process may not exist."
        fi
    else
        echo "No PID file found. Is the server running?"
    fi
}

start_server # Start the python server as it is needed to fetch the docker file

for i in {1..6}; do
    sleep 5  # Wait for 5 seconds before the next iteration
    VM_IP=$(virsh net-dhcp-leases default | grep "$VM_NAME" | awk '{print $5}' | cut -d '/' -f 1);
done    

if [ $? -eq 0 ]; then
    for i in {1..60}; do
        # Run curl and capture the HTTP response code
        response_code=$(curl --connect-timeout 5 -s -o /dev/null -w "%{http_code}" "http://$VM_IP:$REACHABLE_PORT")

        # Check for valid HTTP status codes
        if [[ "$response_code" == "200" || "$response_code" == "403" || "$response_code" == "404" ]]; then
            echo "Success! Received HTTP status code: $response_code"
            stop_server  # Call stop_server function if successful
            exit 0       # Exit the script successfully
        else
            echo "Attempt $i: Received HTTP status code: $response_code. Retrying in 5 seconds..."
        fi

        sleep 5  # Wait for 5 seconds before retrying
    done

    stop_server
    echo "Failed to receive a valid HTTP response after 60 attempts. Exiting the script."
    exit 1  # Exit the script with an error
else
    echo "Previous command failed. Exiting the script."
    exit 1  # Exit if the initial condition fails
fi