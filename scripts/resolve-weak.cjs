if (typeof Function.prototype.resolveWeak !== "function") {
  Function.prototype.resolveWeak = function resolveWeak(specifier) {
    return specifier;
  };
}
