// Get the room ID from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

// Local variables
const drawingCanvas = document.getElementById("drawingCanvas");
const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const ctx = drawingCanvas.getContext("2d");
const drawingData = [];

// Connect to the Socket.IO server
const socket = io();
let isDrawing = false;
let isCameraEnabled = true;
let isAudioEnabled = true;
let currentPath = [];
let drawingPath = null;
// Join the room with the specified room ID
socket.emit("join-room", roomId);

// Get the local video stream
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    const localVideo = document.getElementById("localVideo");
    localVideo.srcObject = stream;
    localVideo.style.transform = "scaleX(-1)";

    // Create a new WebRTC peer connection
    const peerConnection = new RTCPeerConnection();

    // Add the local stream to the peer connection
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    // Listen for ICE candidates and send them to the other peer
    peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    });

    // Listen for remote tracks and add them to the remote video element
    peerConnection.addEventListener("track", (event) => {
      const remoteVideo = document.getElementById("remoteVideo");
      if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = new MediaStream();
        remoteVideo.style.transform = "scaleX(-1)";
      }
      remoteVideo.srcObject.addTrack(event.track);
    });

    // Send the offer to the other peer
    peerConnection
      .createOffer()
      .then((offer) => {
        socket.emit("offer", offer);
        return peerConnection.setLocalDescription(offer);
      })
      .catch((error) => {
        console.error("Error creating offer:", error);
      });

    // Handle the received offer
    socket.on("offer", (offer) => {
      peerConnection
        .setRemoteDescription(offer)
        .then(() => {
          return peerConnection.createAnswer();
        })
        .then((answer) => {
          socket.emit("answer", answer);
          return peerConnection.setLocalDescription(answer);
        })
        .catch((error) => {
          console.error("Error creating answer:", error);
        });
    });

    // Handle the received answer
    socket.on("answer", (answer) => {
      peerConnection.setRemoteDescription(answer).catch((error) => {
        console.error("Error setting remote description:", error);
      });
    });

    // Handle the received ICE candidate
    socket.on("ice-candidate", (candidate) => {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        console.error("Error adding ICE candidate:", error);
      });
    });

    // Disable or enable the camera
    const disableCameraButton = document.getElementById("disableCameraButton");
    disableCameraButton.addEventListener("click", () => {
      if (isCameraEnabled) {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });
        disableCameraButton.querySelector("img").src = "./disable-camera.svg";
      } else {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });
        disableCameraButton.querySelector("img").src = "./enable-camera.svg";
      }
      isCameraEnabled = !isCameraEnabled;
    });
    // Mute/unmute the audio
    const muteButton = document.getElementById("muteButton");
    muteButton.addEventListener("click", () => {
      if (isAudioEnabled) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        // muteButton.textContent = "Unmute";
        muteButton.querySelector("img").src = "./mute.svg";
      } else {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        // muteButton.textContent = "Mute";
        muteButton.querySelector("img").src = "./unmute.svg";
      }
      isAudioEnabled = !isAudioEnabled;
    });

    // Draw on the canvas

    drawingCanvas.addEventListener("mousemove", (e) => {
      if (isDrawing) {
        draw(e);
      }
    });

    drawingCanvas.addEventListener("mousedown", (e) => {
      currentPath = [];
      isDrawing = true;
      draw(e);
    });

    drawingCanvas.addEventListener("mouseup", () => {
      if (isDrawing) {
        isDrawing = false;
        socket.emit("draw", currentPath.slice());
        drawingData.push(currentPath.slice());
        currentPath = [];
        ctx.beginPath();
      }
    });

    socket.on("draw", (data) => {
      drawingData.push(data);
      redrawDrawings();
    });

    deleteButton.addEventListener("click", () => {
      socket.emit("clear-drawing");
      clearDrawingCanvas();
    });

    socket.on("clear-drawing", () => {
      clearDrawingCanvas();
      redrawDrawings();
    });

    undoButton.addEventListener("click", () => {
      socket.emit("undo-drawing");
    });

    socket.on("undo-drawing", () => {
      undoDrawing();
    });

    function clearDrawingCanvas() {
      for (let i = 0; i < drawingData.length; i++) {
        drawingData[i] = [];
      }
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }

    function undoDrawing() {
      if (drawingData.length > 0) {
        drawingData.pop(); // Remove the last drawing
        redrawDrawings();
      } 
    }

    function draw(e) {
      const x = e.clientX - drawingCanvas.getBoundingClientRect().left;
      const y = e.clientY - drawingCanvas.getBoundingClientRect().top;
    
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.strokeStyle = "red";
    
      currentPath.push({ x, y });
    
      ctx.beginPath();
      if (currentPath.length > 1) {
        const prevPoint = currentPath[currentPath.length - 2];
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    function redrawDrawings() {
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      for (const drawing of drawingData) {
        ctx.beginPath();
        for (const point of drawing) {
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
      }
    }
  })
  .catch((error) => {
    console.error("Error accessing media devices:", error);
  });

// Handle user-connected event
socket.on("user-connected", (userId) => {});

// Handle user-disconnected event
socket.on("user-disconnected", (userId) => {});