const http = require("http");
const fs = require("fs");
const path = require("path");

const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";

function sendJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error("Request body is too large"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/chat") {
        readRequestBody(req)
            .then(async (body) => {
                if (!process.env.GROQ_API_KEY) {
                    sendJson(res, 500, { error: "GROQ_API_KEY is not configured on the server" });
                    return;
                }

                let payload;
                try {
                    payload = JSON.parse(body);
                } catch {
                    sendJson(res, 400, { error: "Request body must be valid JSON" });
                    return;
                }

                if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
                    sendJson(res, 400, { error: "A non-empty messages array is required" });
                    return;
                }

                const groqResponse = await fetch(groqApiUrl, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: payload.messages,
                        temperature: 0.7,
                        max_tokens: 800
                    })
                });
                const groqData = await groqResponse.json();

                if (!groqResponse.ok) {
                    sendJson(res, groqResponse.status, { error: groqData.error?.message || "Groq API request failed" });
                    return;
                }

                sendJson(res, 200, { message: groqData.choices?.[0]?.message?.content || "No response received." });
            })
            .catch((error) => {
                console.error("Chat request failed:", error.message);
                sendJson(res, 500, { error: "Unable to process the chat request" });
            });
        return;
    }

    if (req.method !== "GET" || (req.url !== "/" && req.url !== "/index.html")) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end("Error loading page");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/html"
        });

        res.end(data);
    });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});