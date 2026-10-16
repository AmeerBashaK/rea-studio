/* SPDX-License-Identifier: AGPL-3.0-only */
/* Static-analysis fixture only: builds are never executed by the test suite. */
typedef unsigned int u32;
#define EXPORTED __declspec(dllexport) __attribute__((noinline))
EXPORTED u32 arithmetic(u32 x, u32 y) { return ((x * 7u) + y) ^ 0x13579bdu; }
EXPORTED u32 choose(u32 x) { if (x & 1u) return arithmetic(x, 9u); return arithmetic(x, 17u); }
EXPORTED u32 sum_loop(const u32 *values, u32 count) { u32 sum=0; for(u32 i=0;i<count;i++) sum+=values[i] ^ i; return sum; }
EXPORTED u32 dispatch(u32 x) { switch(x) { case 0:return 17;case 1:return 31;case 2:return 53;case 3:return 97;case 4:return 151;default:return x+3u; } }
typedef u32 (*callback)(u32,u32);
EXPORTED u32 indirect(callback fn, u32 value) { return fn(value, 5u); }
EXPORTED void entry(void) { volatile u32 result=choose(3u); (void)result; }
