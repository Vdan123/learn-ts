
/**
 * Atlas 注:
 * 这是一个经典的闭包 (Closure) 应用场景。
 * 我们不仅要限制执行频率，还要确保：
 * 1. 类型安全 (TypeScript Generics)
 * 2. `this` 上下文正确传递 (Context Preservation)
 * 3. 内存泄漏防护 (Memory Management via AbortSignal)
 */

export interface DebounceOptions {
  /**
   * 可选的 AbortSignal，用于从外部取消 pending 的函数执行。
   * 这是一个现代 Web API 模式，比传统的 .cancel() 方法更解耦。
   */
  signal?: AbortSignal;

  /**
   * 指定在延迟周期的"开始"还是"结束"执行。
   * - 'leading': 立即执行，然后冷却
   * - 'trailing': 冷却结束后执行 (默认)
   */
  edges?: Array<'leading' | 'trailing'>;
}

// F 必须是一个函数。这里使用泛型 F 来捕获原始函数的类型，
// 以便返回的 debounced 函数能保持相同的参数类型。
export interface DebouncedFunction<F extends (...args: any[]) => void> {
  (...args: Parameters<F>): void;

  /** 手动重新调度计时器 */
  schedule: () => void;

  /** 取消执行并清理内存 */
  cancel: () => void;

  /** 立即执行当前挂起的调用 */
  flush: () => void;
}

export function debounce<F extends (...args: any[]) => void>(
  func: F,
  debounceMs: number,
  { signal, edges }: DebounceOptions = {}
): DebouncedFunction<F> {
  // 闭包状态区 (Closure State)
  // 这些变量保存在内存中，即使 debounce 函数返回后依然存在。
  // 它们记录了"上一次"调用的状态。

  // 保存函数的 `this` 上下文。
  // 为什么需要？因为 func 可能是对象的方法，调用时需要正确的 `this` 指向该对象。
  let pendingThis: any = undefined;

  // 保存最近一次调用的参数。
  // 为什么是 Parameters<F>？为了类型安全，确保参数类型匹配原函数。
  let pendingArgs: Parameters<F> | null = null;

  const leading = edges != null && edges.includes('leading');
  const trailing = edges == null || edges.includes('trailing');

  // 核心执行逻辑
  const invoke = () => {
    if (pendingArgs !== null) {
      // 使用 apply 来绑定正确的 this 和参数
      func.apply(pendingThis, pendingArgs);
      // 执行后清理引用，帮助垃圾回收 (GC)
      pendingThis = undefined;
      pendingArgs = null;
    }
  };

  const onTimerEnd = () => {
    // 只有在 trailing (尾部) 模式下，计时器结束才触发执行
    if (trailing) {
      invoke();
    }
    // 无论是否执行，计时器结束都要清理状态
    cancel();
  };

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // 调度器：核心的时间管理逻辑
  const schedule = () => {
    // 如果已有计时器，说明之前的冷却还没结束，必须清除它（"防抖"的精髓）
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }

    // 重新设置计时器
    timeoutId = setTimeout(() => {
      timeoutId = null;
      onTimerEnd();
    }, debounceMs);
  };

  const cancelTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  // 取消操作：不仅仅是清除计时器，还要清除闭包引用的对象，防止内存泄漏
  const cancel = () => {
    cancelTimer();
    pendingThis = undefined;
    pendingArgs = null;
  };

  const flush = () => {
    invoke();
  };

  // 这是最终返回给用户的函数
  // 注意：这里不能用箭头函数，必须用 function 关键字，
  // 这样才能捕获调用时的 `this` (Dynamic Scoping)。
  const debounced = function (this: any, ...args: Parameters<F>) {
    if (signal?.aborted) {
      return;
    }

    // 捕获当前的上下文和参数，供稍后 invoke 使用
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    pendingThis = this;
    pendingArgs = args;

    const isFirstCall = timeoutId == null;

    // 无论如何，先重置/启动计时器
    schedule();

    // 如果是 Leading 模式，且是这一轮的第一次调用，立即执行
    if (leading && isFirstCall) {
      invoke();
    }
  };

  // 挂载辅助方法
  debounced.schedule = schedule;
  debounced.cancel = cancel;
  debounced.flush = flush;

  // 如果传入了 AbortSignal，绑定一次性的取消事件
  signal?.addEventListener('abort', cancel, { once: true });

  return debounced;
}

