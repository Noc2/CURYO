import Module from "node:module";

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
