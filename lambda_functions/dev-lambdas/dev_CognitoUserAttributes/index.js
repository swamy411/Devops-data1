const http = require("http");
const PORT = 8080;

const requestHandler = (req, res) => {
	res.end("Hello from AWS Cloud9!")
}

const server = http.createServer(requestHandler);

server.listen(PORT, (err) => {
	if (err) {
		console.log("Error occurred", err) ;
	}
	console.log(`Server is listening on ${PORT}`);
})