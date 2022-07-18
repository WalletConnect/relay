import { Bucket } from "../types";
import { RollingCounterOpts } from "../types/misc";

export class RollingCounter {
  private bucket: Bucket;
  private limit: number;
  private interval: number;
  private errorMessage: string;

  constructor(opts: RollingCounterOpts) {
    this.limit = opts.limit;
    this.interval = opts.interval;
    this.errorMessage = opts.errorMessage || "Limit reached";
    this.bucket = {
      timestamp_seconds: Math.floor(Date.now() / 1000),
      counter: 0,
    };
  }

  /**
   *
   * The algorithm counts the counter increments during the current interval e.g. 1 second
   * if the counter exceed the limit during the interval, exception is thrown
   * if the interval elapses, the counter is reset
   *
   */
  public increment() {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (this.isCurrentInterval(nowSeconds) && this.bucket.counter > this.limit) {
      throw new Error(this.errorMessage);
    }

    if (this.isCurrentInterval(nowSeconds)) {
      this.bucket.counter++;
    } else {
      this.bucket.timestamp_seconds = nowSeconds;
      this.bucket.counter = 1;
    }
  }

  /**
   * checks if the throttle interval has elaped since the last increment timestamp
   *
   * @param currentTimestamp
   * @returns boolean
   */
  private isCurrentInterval(currentTimestamp: number): boolean {
    return currentTimestamp - this.bucket.timestamp_seconds < this.interval;
  }
}
