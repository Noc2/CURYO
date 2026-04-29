import {
  ASK_AGENT_ROUTE,
  ASK_AGENT_ROUTE_TAB,
  ASK_MANUAL_ROUTE_TAB,
  ASK_ROUTE,
  ASK_ROUTE_TAB_PARAM,
  buildRouteWithSearchParams,
  parseAskRouteTab,
} from "./routes";
import assert from "node:assert/strict";
import test from "node:test";

test("agent submit route targets the ask page agent tab", () => {
  assert.equal(ASK_AGENT_ROUTE, `${ASK_ROUTE}?${ASK_ROUTE_TAB_PARAM}=${ASK_AGENT_ROUTE_TAB}`);
});

test("ask route tab parsing defaults to manual unless agent is requested", () => {
  assert.equal(parseAskRouteTab(ASK_AGENT_ROUTE_TAB), ASK_AGENT_ROUTE_TAB);
  assert.equal(parseAskRouteTab(ASK_MANUAL_ROUTE_TAB), ASK_MANUAL_ROUTE_TAB);
  assert.equal(parseAskRouteTab("docs"), ASK_MANUAL_ROUTE_TAB);
  assert.equal(parseAskRouteTab(undefined), ASK_MANUAL_ROUTE_TAB);
});

test("route search param builder preserves ask tab values", () => {
  assert.equal(buildRouteWithSearchParams(ASK_ROUTE, { [ASK_ROUTE_TAB_PARAM]: ASK_AGENT_ROUTE_TAB }), ASK_AGENT_ROUTE);
});
