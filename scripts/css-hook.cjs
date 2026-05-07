const Module = require("node:module");

Module._extensions[".css"] = () => undefined;
