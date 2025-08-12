{
  "targets": [
    {
      "target_name": "thermal_engine",
      "sources": [
        "binding.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.7"
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 },
      },
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "include_dirs": [
            "C:/opencv/build/include",
            "C:/opencv/build/include/opencv2"
          ],
          "library_dirs": [
            "C:/opencv/build/x64/vc15/lib"
          ],
          "libraries": [
            "-lopencv_world4100",
            "-lopencv_world4100d"
          ],
          "copies": [{
            "destination": "<(module_root_dir)/build/Release/",
            "files": [
              "C:/opencv/build/x64/vc15/bin/opencv_world4100.dll",
              "C:/opencv/build/x64/vc15/bin/opencv_world4100d.dll"
            ]
          }]
        }],
        ["OS=='mac'", {
          "include_dirs": [
            "/usr/local/include/opencv4",
            "/usr/local/include/opencv4/opencv2",
            "/opt/homebrew/include/opencv4",
            "/opt/homebrew/include/opencv4/opencv2"
          ],
          "library_dirs": [
            "/usr/local/lib",
            "/opt/homebrew/lib"
          ],
          "libraries": [
            "-lopencv_core",
            "-lopencv_imgproc",
            "-lopencv_imgcodecs",
            "-lopencv_videoio",
            "-lopencv_highgui"
          ],
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [
              "-std=c++11",
              "-stdlib=libc++"
            ],
            "OTHER_LDFLAGS": [
              "-stdlib=libc++"
            ]
          }
        }],
        ["OS=='linux'", {
          "include_dirs": [
            "/usr/include/opencv4",
            "/usr/include/opencv4/opencv2",
            "/usr/local/include/opencv4",
            "/usr/local/include/opencv4/opencv2",
            "<!@(pkg-config --cflags-only-I opencv4 2>/dev/null | sed s/-I//g)"
          ],
          "libraries": [
            "<!@(pkg-config --libs opencv4 2>/dev/null)"
          ],
          "cflags": [
            "<!@(pkg-config --cflags opencv4 2>/dev/null)"
          ],
          "cflags_cc": [
            "-std=c++11"
          ]
        }]
      ]
    }
  ]
}