const models = require("../models.json");

module.exports = function modelsHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    return res.end();
  }
  res.statusCode = 200;
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(models));
};
