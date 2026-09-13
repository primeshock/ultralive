"use client";

import { io } from "socket.io-client";
import { API_URL } from "./api";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}
