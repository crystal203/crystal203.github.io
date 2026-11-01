import {waveformPeaks} from './waveform-peaks.js';
self.onmessage=({data})=>{try{const peaks=waveformPeaks(data.channels,data.sampleRate),transfer=peaks.levels.flatMap(level=>[level.min.buffer,level.max.buffer]);self.postMessage({id:data.id,peaks},transfer);}catch(error){self.postMessage({id:data.id,error:error.message});}};
