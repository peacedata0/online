bin_PROGRAMS = mobile

include_paths = -I${top_srcdir}/common -I${top_srcdir}/net -I${top_srcdir}/kit -I${top_srcdir}/wsd -I${top_srcdir}

warning_flags = -Wall -Werror -Wno-parentheses -Wno-sign-compare -Wno-unused-variable -Wno-stringop-overflow
define_flags = -DMOBILEAPP

AM_CPPFLAGS = -pthread \
              -DLOOLWSD_DATADIR='"@LOOLWSD_DATADIR@"' \
              -DLOOLWSD_CONFIGDIR='"@LOOLWSD_CONFIGDIR@"' \
              -DTOPSRCDIR='"'$(realpath ${top_srcdir})'"' \
              ${define_flags} \
              ${warning_flags} \
              ${include_paths} \
              ${WEBKIT_CFLAGS}

AM_LDFLAGS = -pthread ${WEBKIT_LIBS} -ldl

common_sources = ../common/Unit.cpp \
                 ../common/FileUtil.cpp \
                 ../common/Log.cpp \
                 ../common/MessageQueue.cpp \
                 ../common/Protocol.cpp \
                 ../common/Session.cpp \
                 ../common/SigUtil.cpp \
                 ../common/SpookyV2.cpp \
                 ../common/Util.cpp

kit_sources = ../kit/ChildSession.cpp \
              ../kit/Kit.cpp

net_sources = ../net/FakeSocket.cpp \
              ../net/Socket.cpp

wsd_sources = ../wsd/ClientSession.cpp \
              ../wsd/DocumentBroker.cpp \
              ../wsd/LOOLWSD.cpp \
              ../wsd/Storage.cpp \
              ../wsd/TileCache.cpp

mobile_SOURCES = mobile.cpp $(common_sources) $(kit_sources) $(net_sources) $(wsd_sources)
