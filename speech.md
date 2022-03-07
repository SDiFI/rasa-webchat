# Using speech as input

The widget supports streaming speech input via a gRPC-Web connection to a
running instance of [Tiro Speech
Core](https://github.com/tiro-is/tiro-speech-core). A [postinstall
script](dev/update-proto) generates the client code under [src/proto](). The
current implementation is hardcoded to use `speech.tiro.is`, see
[src/speech.js]().
