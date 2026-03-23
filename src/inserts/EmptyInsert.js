import { BaseInsert } from "./BaseInsert.js";

export class EmptyInsert extends BaseInsert {
  static id = "empty";
  static label = "Empty";

  static render() {
    return null;
  }
}
