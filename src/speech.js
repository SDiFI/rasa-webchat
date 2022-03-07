import { grpc } from '@improbable-eng/grpc-web';
import * as speech_pb_service from './proto/tiro/speech/v1alpha/speech_pb_service';
import * as speech_pb from './proto/tiro/speech/v1alpha/speech_pb';

const SPEECH_SERVICE_ADDRESS = "https://speech.tiro.is";

let client = null;
let stream = null;

export const getClient = () => {
  if (!!client)
    return client;

  client = new speech_pb_service.SpeechClient(
    SPEECH_SERVICE_ADDRESS, {
      transport: grpc.WebsocketTransport(),
    }
  );

  return client;
}

export const initStream = (options) => {
  const { handleMessage, handleEnd } = options;

  if (!client)
    client = getClient();

  if (stream) {
    stream.cancel();
  }

  stream = client.streamingRecognize();

  stream.on('data', (message) => {
    if (handleMessage) {
      handleMessage(message);
    }
  });

  stream.on('end', (status) => {
    if (!status) {
      console.debug('stream ended without status');
    } else {
      console.debug('stream ended, the status was:', status);
    }
    if (handleEnd) {
      handleEnd(status);
    }
  });

  stream.on('status', (status) => {
  });

  return stream;
}


export const floatTo16BitPCM = (output /*: ArrayBuffer */, input /*: Float32Array */, offset /* ?: number */) => {
  const outView = new DataView(output);
  if (!offset) offset = 0;
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    outView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};


export const initSingleUttSpeechRecognition = (handleTranscript) => {
  const audioCtx = new AudioContext();
  let processingNode = null;

  navigator
    .mediaDevices
    .getUserMedia({audio: true, video: false})
    .then((stream) => {
      return audioCtx.createMediaStreamSource(stream)
    })
    .then((audioNode) => {
      initStream({
        handleMessage: (message) => {
          if (handleTranscript && message.getResultsList().length > 0) {
            const result = message.getResultsList()[0];
            const alternatives = result.getAlternativesList();
            if (alternatives.length > 0) {
              const transcript = alternatives[0].getTranscript();
              handleTranscript(transcript, { isFinal: result.getIsFinal() });
            }
          }
        },
        handleEnd: (status) => {
          if (status.code == grpc.OK) {
            console.debug("ended successfully, emit user message!")
          } else {
            console.warn("ended unsuccessfully!", status);
          }
          console.debug("closing ctx and cleaning up");
          audioCtx.close();
        },
      });

      const streamingConfig = new speech_pb.StreamingRecognitionConfig();
      streamingConfig.setSingleUtterance(true);
      streamingConfig.setInterimResults(true);
      const config = new speech_pb.RecognitionConfig();
      config.setEncoding(speech_pb.RecognitionConfig.AudioEncoding.LINEAR16);
      config.setEnableAutomaticPunctuation(true);
      config.setLanguageCode('is-IS');
      config.setSampleRateHertz(audioCtx.sampleRate);
      streamingConfig.setConfig(config);

      const req = new speech_pb.StreamingRecognizeRequest();
      req.setStreamingConfig(streamingConfig);
      console.debug("streamingConfig:", streamingConfig.toObject());
      stream.write(req);

      processingNode = audioCtx.createScriptProcessor(8192, 1, 1);
      processingNode.onaudioprocess = (e) => {
        if (!e.inputBuffer.getChannelData(0).every((elem) => elem === 0)) {
          const req = new speech_pb.StreamingRecognizeRequest();
          const content = new Uint8Array(e.inputBuffer.getChannelData(0).length * 2);
          floatTo16BitPCM(content.buffer, e.inputBuffer.getChannelData(0));
          req.setAudioContent(content);
          stream.write(req);
        }
      };

      audioNode.connect(processingNode)
               .connect(audioCtx.destination);
    });
}
