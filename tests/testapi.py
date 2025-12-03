from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/dummyapi", methods=["GET"])
def get_dummy_data():
    data = {
        "id": 1,
        "name": "Dummy Item",
        "description": "This is a dummy item for testing.",
        "status": "active"
    }
    return jsonify(data)

if __name__ == "__main__":
    # Run the Flask app in debug mode
    app.run(debug=True, host='0.0.0.0', port=5000)
