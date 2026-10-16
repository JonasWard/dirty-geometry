import { Angle } from '../../core/angle';
import { Epsilon } from '../../core/epsilon';
import { Frame2 } from '../../core/frame2';
import { Mat3 } from '../../core/mat3';
import { Vec2 } from '../../core/vec2';
import { codec } from '../codec';
import { isAngleJson, isEpsilonJson, isFrame2Json, isMat3Json, isVec2Json } from '../json-guards';

export const vec2Codec = codec(Vec2.type, isVec2Json, (json) => new Vec2(json.x, json.y));

export const mat3Codec = codec(Mat3.type, isMat3Json, (json) => {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = json.elements;
  return new Mat3(m00, m01, m02, m10, m11, m12, m20, m21, m22);
});

export const angleCodec = codec(Angle.type, isAngleJson, (json) => new Angle(json.value, json.domainKind, json.precision));

export const frame2Codec = codec(
  Frame2.type,
  isFrame2Json,
  (json) => new Frame2(vec2Codec.decode(json.origin), vec2Codec.decode(json.xAxis), vec2Codec.decode(json.yAxis)),
);

export const epsilonCodec = codec(Epsilon.type, isEpsilonJson, (json) => Epsilon.custom(json.value));

export const coreCodecs = [vec2Codec, mat3Codec, angleCodec, frame2Codec, epsilonCodec] as const;
