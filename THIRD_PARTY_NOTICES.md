# Solver attribution

The Wagner bucket layout and packed tree references derive from
[John Tromp's Equihash solver](https://github.com/tromp/equihash), inspected at
commit `fab686ed3fac49dfd22624851025f31856728517`. The browser implementation
rewrites the algorithm in WGSL, partitions storage into device-sized chunks,
and reconstructs only candidate trees on the host. Tromp's CUDA Blake2b file
also credits tpruvot, July 2016, with permission to use it under MIT.

The MIT License (MIT)

Copyright (c) 2016 John Tromp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
