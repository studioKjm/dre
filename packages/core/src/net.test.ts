import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateAddress, isPrivateHostname } from "./net.js";

test("private and reserved IPv4 ranges are detected", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
    assert.ok(isPrivateAddress(ip), ip);
  }
});

test("public IPv4 addresses are allowed, including range edges", () => {
  for (const ip of ["8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1", "100.63.0.1", "93.184.216.34"]) {
    assert.ok(!isPrivateAddress(ip), ip);
  }
});

test("IPv6 loopback, ULA, link-local and mapped private addresses are detected", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::1]"]) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress("2606:4700:4700::1111"));
  assert.ok(!isPrivateAddress("::ffff:8.8.8.8"));
});

test("hostnames: local-only names and IP literals are private, normal names are not", () => {
  for (const h of ["localhost", "app.localhost", "printer.local", "db.internal", "127.0.0.1", "[::1]", "localhost."]) {
    assert.ok(isPrivateHostname(h), h);
  }
  for (const h of ["example.com", "a.co", "8.8.8.8"]) assert.ok(!isPrivateHostname(h), h);
});
